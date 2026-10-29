type JsonLdProps = {
  data: unknown;
  id?: string;
};

/**
 * Render crawlable JSON-LD directly in the server HTML.
 *
 * `next/script` is intended for executable scripts and may defer or omit
 * inert JSON-LD during rendering. A native script element is the pattern
 * recommended by Next.js. Escaping `<` prevents user-controlled strings from
 * closing the element and injecting markup.
 */
export function JsonLd({ data, id }: JsonLdProps) {
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
