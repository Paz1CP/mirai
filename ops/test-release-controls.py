import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def fake():
    state_path = Path("live.json")
    state = json.loads(state_path.read_text())
    method = Path(sys.argv[0]).name
    args = sys.argv[1:]
    if method == "curl":
        body_path = Path(args[args.index("--output") + 1])
        app = "api" if "api.example" in args[-1] else "web"
        if os.environ["SCENARIO"] == "health" and app == "web" and state["web"]["new"] == 100:
            body_path.write_text("Failed health fixture")
            print("503", end="")
        else:
            body_path.write_text('{"status":"ok"}' if app == "api" else "API: <!-- -->connected")
            print("200", end="")
        return
    if method == "sleep":
        return
    app = args[3].split("-")[1]
    if args[2] == "describe":
        entries = [
            {"revisionName": f"mirai-{app}-{name}", "percent": percent}
            for name, percent in state[app].items() if name != "tag" and percent
        ]
        entries += [{"revisionName": f"mirai-{app}-legacy", "tag": "historical"}]
        if state[app]["tag"]:
            entries += [{"revisionName": f"mirai-{app}-new", "tag": "r-1-1"}]
        runtime = {"containers": [{"env": [{"name": "API_URL", "value": "https://api.example"}],
                                  "image": f"fixture/mirai-{app}"}], "serviceAccountName": app}
        print(json.dumps({"status": {"traffic": entries}, "spec": {"template": {"spec": runtime}}}))
        return
    assignment = next((arg.split("=", 1)[1] for arg in args if arg.startswith("--to-revisions=")), None)
    if assignment:
        if os.environ["SCENARIO"] == "partial" and app == "web" and assignment.endswith("-new=100"):
            sys.exit(1)
        state[app].update(old1=0, old2=0, new=0)
        for pair in assignment.split(","):
            name, percent = pair.split("=")
            state[app][name.split("-")[-1]] = int(percent)
    elif "--remove-tags=r-1-1" in args:
        state[app]["tag"] = False
    else:
        sys.exit(2)
    state_path.write_text(json.dumps(state))


def test():
    source = Path(__file__).resolve().parent
    for scenario in ("partial", "health"):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            ops = work / "ops"
            ops.mkdir()
            for name in ("deploy.sh", "cloud-run.sh", "rollback.sh"):
                shutil.copy(source / name, ops)
            commands = work / "bin"
            commands.mkdir()
            for name in ("gcloud", "curl", "sleep"):
                program = commands / name
                program.write_text(f'#!/bin/bash\nexec "{sys.executable}" "{__file__}" "{name}" "$@"\n')
                program.chmod(0o755)
            environment = dict(os.environ, PATH=f"{commands}:{os.environ['PATH']}", SCENARIO=scenario,
                               PROJECT="fixture", REGION="fixture", API_SERVICE="mirai-api",
                               WEB_SERVICE="mirai-web", API_ORIGIN="https://api.example",
                               WEB_ORIGIN="https://web.example")
            allocation = {"old1": 40, "old2": 60, "new": 0, "tag": True}
            (work / "live.json").write_text(json.dumps({"api": allocation, "web": allocation}))
            if scenario == "partial":
                capture_env = dict(environment, GITHUB_SHA="fixture", GITHUB_RUN_ID="1", GITHUB_RUN_ATTEMPT="1",
                                   SCHEMA="fixture", API_IMAGE="api-image", WEB_IMAGE="web-image",
                                   API_BUILD="api-build", WEB_BUILD="web-build")
                subprocess.run(["bash", "ops/deploy.sh", "capture"], cwd=work, env=capture_env,
                               timeout=15, check=True)
                captured = json.loads((work / "previous.json").read_text())
                for app in ("api", "web"):
                    spec = {"containers": [{"env": [{"name": "API_URL", "value": "https://api.example"}]}],
                            "serviceAccountName": app}
                    canonical = json.dumps(spec, sort_keys=True, separators=(",", ":")) + "\n"
                    assert captured["configuration"][app] == hashlib.sha256(canonical.encode()).hexdigest()
                print("capture: records the runtime fingerprint for both services")
            prior = {app: [{"revision": f"mirai-{app}-old1", "percent": 40, "tag": ""},
                           {"revision": f"mirai-{app}-old2", "percent": 60, "tag": ""},
                           {"revision": f"mirai-{app}-legacy", "percent": 0, "tag": "historical"}]
                     for app in ("api", "web")}
            (work / "prior.json").write_text(json.dumps(prior))
            candidates = {app: {"revision": f"mirai-{app}-new"} for app in prior}
            (work / "candidates.json").write_text(json.dumps(dict(candidates, tag="r-1-1")))
            result = subprocess.run(["bash", "ops/deploy.sh", "promote", "prior.json", "candidates.json"],
                                    cwd=work, env=environment, timeout=60)
            assert result.returncode != 0, scenario
            assert (work / "rollback-result.txt").read_text().strip() == "Success", scenario
            actual = json.loads((work / "live.json").read_text())
            assert actual == {app: dict(allocation, tag=False) for app in prior}, actual
            print(f"{scenario}: restored both exact splits, verified health and removed only release tags")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        sys.argv = sys.argv[1:]
        fake()
    else:
        test()
