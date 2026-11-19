import {
  applicationDetailSchema,
  applicationPageSchema,
  campaignPageSchema,
  campaignSummarySchema,
  dashboardSchema,
  type ApplicationListQuery,
  type CampaignListQuery,
} from "@mirai/contracts";
import { request } from "@/features/profiles/profileApi";

function parameters(query: Partial<ApplicationListQuery | CampaignListQuery>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params.toString();
}

export const resultsApi = {
  dashboard: async (signal?: AbortSignal) =>
    dashboardSchema.parse(await request("dashboard", "GET", undefined, signal)),
  applications: async (query: Partial<ApplicationListQuery>, signal?: AbortSignal) =>
    applicationPageSchema.parse(
      await request(`applications?${parameters(query)}`, "GET", undefined, signal),
    ),
  application: async (id: string, signal?: AbortSignal) =>
    applicationDetailSchema.parse(await request(`applications/${id}`, "GET", undefined, signal)),
  campaigns: async (query: Partial<CampaignListQuery>, signal?: AbortSignal) =>
    campaignPageSchema.parse(
      await request(`campaigns?${parameters(query)}`, "GET", undefined, signal),
    ),
  campaign: async (id: string, signal?: AbortSignal) =>
    campaignSummarySchema.parse(await request(`campaigns/${id}`, "GET", undefined, signal)),
};
