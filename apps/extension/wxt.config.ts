import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Mirai",
    description: "__MSG_extensionDescription__",
    default_locale: "es",
    browser_specific_settings: {
      gecko: {
        id: "mirai@mirai.app",
        data_collection_permissions: { required: ["none"] },
      },
    },
  },
});
