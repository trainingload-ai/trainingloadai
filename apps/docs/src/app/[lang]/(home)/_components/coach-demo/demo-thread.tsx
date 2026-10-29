"use client";

import type { CoachDemoCopy, CoachDemoSession } from "./types";
import { DemoAssistantMessage } from "./demo-assistant-message";
import { DemoUserMessage } from "./demo-user-message";

/** 遍历预定义 messages，按 role 分发到对应渲染器 */
export function DemoThread({
  session,
  copy,
}: {
  session: CoachDemoSession;
  copy: CoachDemoCopy;
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 sm:max-w-[920px] sm:gap-6">
      {session.messages.map((message) =>
        message.role === "user" ? (
          <DemoUserMessage key={message.id} text={message.text} />
        ) : (
          <DemoAssistantMessage
            key={message.id}
            parts={message.parts}
            copy={copy}
          />
        ),
      )}
    </div>
  );
}
