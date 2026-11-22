/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { extensionReadySchema } from "@mirai/contracts";
import { z } from "zod";

// Structural mirrors of @types/chrome shapes used over the wire. The extension
// imports the real chrome.* types and they are structurally compatible.
export type Debuggee = { tabId?: number; extensionId?: string; targetId?: string };
export type DebuggerSession = Debuggee & { sessionId?: string };
export type TabCreateProperties = {
  active?: boolean;
  index?: number;
  openerTabId?: number;
  pinned?: boolean;
  url?: string;
  windowId?: number;
};
export type Tab = {
  id?: number;
  index: number;
  windowId: number;
  openerTabId?: number;
  url?: string;
  title?: string;
  active: boolean;
  pinned: boolean;
};
export const chromeTabIdSchema = z.int().nonnegative();
export const chromeTabSchema = z.object({ id: chromeTabIdSchema });
export const workspaceTabsSchema = z.object({
  selectedTabId: chromeTabIdSchema.optional(),
  tabs: z.array(
    chromeTabSchema.extend({
      windowId: z.int(),
      url: z.string().optional(),
      title: z.string().optional(),
      active: z.boolean(),
    }),
  ),
});

// Command params/results mirror chrome.* positional arguments, so the
// extension can spread them straight into chrome.<api>.<method>(...).
export type ExtensionCommands = {
  // chrome.debugger.attach(target, requiredVersion)
  "chrome.debugger.attach": {
    params: [target: Debuggee, requiredVersion: string];
    result: void;
  };
  // chrome.debugger.detach(target)
  "chrome.debugger.detach": {
    params: [target: Debuggee];
    result: void;
  };
  // chrome.debugger.sendCommand(target, method, commandParams?)
  "chrome.debugger.sendCommand": {
    params: [target: DebuggerSession, method: string, commandParams?: object];
    result: unknown;
  };
  // chrome.tabs.create(createProperties)
  "chrome.tabs.create": {
    params: [createProperties: TabCreateProperties];
    result: Tab;
  };
  "extension.workspaceTabs": {
    params: [];
    result: z.infer<typeof workspaceTabsSchema>;
  };
  "extension.selectTab": {
    params: [tabId: number];
    result: void;
  };
  // chrome.tabs.remove(tabIds)
  "chrome.tabs.remove": {
    params: [tabIds: number | number[]];
    result: void;
  };
};

const debuggerSourceSchema = z.object({
  tabId: chromeTabIdSchema.optional(),
  sessionId: z.string().optional(),
});

export const extensionEventSchema = z.discriminatedUnion("method", [
  extensionReadySchema,
  z.object({
    method: z.literal("chrome.tabs.onCreated"),
    params: z.tuple([chromeTabSchema]),
  }),
  z.object({
    method: z.literal("chrome.tabs.onUpdated"),
    params: z.tuple([
      chromeTabIdSchema,
      z.object({
        url: z.string().optional(),
        title: z.string().optional(),
        discarded: z.boolean().optional(),
      }),
    ]),
  }),
  z.object({
    method: z.literal("chrome.tabs.onRemoved"),
    params: z.tuple([
      chromeTabIdSchema,
      z.object({ windowId: z.int(), isWindowClosing: z.boolean() }),
    ]),
  }),
  z.object({
    method: z.literal("chrome.tabs.onReplaced"),
    params: z.tuple([chromeTabIdSchema, chromeTabIdSchema]),
  }),
  z.object({
    method: z.literal("chrome.debugger.onEvent"),
    params: z.tuple([
      debuggerSourceSchema,
      z.string(),
      z.record(z.string(), z.unknown()).nullish(),
    ]),
  }),
  z.object({
    method: z.literal("chrome.debugger.onDetach"),
    params: z.tuple([debuggerSourceSchema, z.string()]),
  }),
]);

export type ExtensionEvent = z.infer<typeof extensionEventSchema>;
