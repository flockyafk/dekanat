"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { QUESTION_MAX, QUESTION_MIN, askAssistant, dailyLimit, type AssistantAnswer } from "@/lib/ai";
import { getMyAiUsageToday } from "@/lib/data/assistant";
import { dateKey } from "@/lib/time";

const schema = z.object({ question: z.string().trim().min(QUESTION_MIN).max(QUESTION_MAX) });

export type AskResult = { answer: AssistantAnswer; remaining: number };

/**
 * Вопрос помощнику. Вызывается как серверное действие (POST): текст вопроса не попадает в адрес страницы.
 * Студент определяется только по сессии. Текст вопроса не записывается в журнал.
 */
export async function askAction(question: string): Promise<AskResult> {
  const user = await requireUser();
  const parsed = schema.safeParse({ question });
  const answer: AssistantAnswer = parsed.success
    ? await askAssistant(user, parsed.data.question)
    : { ok: false, reason: "invalid", text: `Напишите вопрос: от ${QUESTION_MIN} до ${QUESTION_MAX} символов.` };
  const used = user.role === "student" ? await getMyAiUsageToday(user, dateKey()) : 0;
  return { answer, remaining: Math.max(0, dailyLimit() - used) };
}
