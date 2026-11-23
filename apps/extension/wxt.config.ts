import { defineConfig } from "wxt";

export default defineConfig({
  manifest: ({ browser }) => ({
    name: "Mirai",
    description: "__MSG_extensionDescription__",
    default_locale: "es",
    ...(browser === "chrome"
      ? { minimum_chrome_version: "118", permissions: ["debugger", "tabs"] }
      : {}),
    browser_specific_settings: {
      gecko: {
        id: "mirai@mirai.app",
        data_collection_permissions: { required: ["none"] },
      },
    },
  }),
});
