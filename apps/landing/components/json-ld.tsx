export type JsonLdData = Record<string, unknown>;

/** Serializes structured data safely: `<` is escaped so the payload cannot close the script tag. */
export function JsonLd({ data }: { data: JsonLdData }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
