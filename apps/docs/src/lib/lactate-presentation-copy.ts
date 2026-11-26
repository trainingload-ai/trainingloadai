import messages from "@trainingloadai/messages/docs-copy/lactate-presentation.json";

export type LactatePresentationCopy = typeof messages.en;

export function getLactatePresentationCopy(lang: string): LactatePresentationCopy {
  return Object.hasOwn(messages, lang)
    ? messages[lang as keyof typeof messages]
    : messages.en;
}
