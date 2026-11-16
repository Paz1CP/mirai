import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Mirai",
    description: "__MSG_extensionDescription__",
    default_locale: "es",
    permissions: ["storage"],
    host_permissions: [
      `${new URL(process.env.WXT_API_ORIGIN ?? "http://localhost:4000").protocol}//${new URL(process.env.WXT_API_ORIGIN ?? "http://localhost:4000").hostname}/*`,
    ],
    browser_specific_settings: {
      gecko: {
        id: "mirai@mirai.app",
        data_collection_permissions: { required: ["authenticationInfo"] },
      },
    },
  },
});
