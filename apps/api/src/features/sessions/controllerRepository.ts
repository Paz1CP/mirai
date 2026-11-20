import type { Client } from "pg";

export class ControlConflict extends Error {
  constructor(
    public readonly instanceId?: string,
    public readonly afterClaim = false,
  ) {
    super("CONTROL_CONFLICT");
  }
}

export function createControllerRepository() {
  const renewalKey = (accountId: string, instanceId: string, tabId: string) =>
    JSON.stringify(["workspace-renewal", accountId, instanceId, tabId]);

  async function allowRenewal(
    client: Client,
    accountId: string,
    instanceId: string,
    tabId: string,
  ) {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [
      renewalKey(accountId, instanceId, tabId),
    ]);
  }

  async function connect(
    client: Client,
    accountId: string,
    instanceId: string,
    expectedInstanceId?: string,
    renewalTabId?: string,
  ) {
    await client.query("BEGIN");
    try {
      await client.query(
        "INSERT INTO users.account_controllers(account_id, instance_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [accountId, instanceId],
      );
      const { rows } = await client.query<{ instance_id: string }>(
        "SELECT instance_id FROM users.account_controllers WHERE account_id=$1 FOR UPDATE",
        [accountId],
      );
      const current = rows[0]!.instance_id;
      if (expectedInstanceId && current !== expectedInstanceId) throw new ControlConflict(current);
      if (renewalTabId) {
        if (!expectedInstanceId) throw new ControlConflict(current);
        const { rows } = await client.query<{ available: boolean }>(
          "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS available",
          [renewalKey(accountId, current, renewalTabId)],
        );
        if (rows[0]?.available !== false) throw new ControlConflict(current);
      }
      if (current !== instanceId) {
        if (!expectedInstanceId) {
          const { rows } = await client.query<{ available: boolean }>(
            "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS available",
            [current],
          );
          if (!rows[0]?.available) throw new ControlConflict(current);
        }
        await client.query(
          "UPDATE users.account_controllers SET instance_id=$2 WHERE account_id=$1",
          [accountId, instanceId],
        );
        await client.query("SELECT pg_notify('mirai_control', $1)", [
          JSON.stringify({
            accountId,
            previousInstanceId: current,
            instanceId,
            renewal: Boolean(renewalTabId),
          }),
        ]);
      }
      await client.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [instanceId]);
      await client.query("COMMIT");
      // The old socket holds its lock until cancellation and persistence have settled.
      if (current !== instanceId) {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [current]);
        const { rows } = await client.query<{ instance_id: string }>(
          "SELECT instance_id FROM users.account_controllers WHERE account_id=$1",
          [accountId],
        );
        if (rows[0]?.instance_id !== instanceId)
          throw new ControlConflict(rows[0]?.instance_id, true);
      }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  }

  return { connect, allowRenewal };
}
