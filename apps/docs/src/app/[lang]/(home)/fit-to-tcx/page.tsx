import {
  ConverterDirectionPage,
  generateConverterDirectionMetadata,
} from "../converter-direction-page";

const slug = "fit-to-tcx";

export function generateMetadata(props: { params: Promise<{ lang: string }> }) {
  return generateConverterDirectionMetadata(props, slug);
}

export default function Page(props: { params: Promise<{ lang: string }> }) {
  return <ConverterDirectionPage {...props} slug={slug} />;
}
