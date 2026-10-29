import {
  ConverterDirectionPage,
  generateConverterDirectionMetadata,
} from "../converter-direction-page";

const slug = "tcx-to-gpx";

export function generateMetadata(props: { params: Promise<{ lang: string }> }) {
  return generateConverterDirectionMetadata(props, slug);
}

export default function Page(props: { params: Promise<{ lang: string }> }) {
  return <ConverterDirectionPage {...props} slug={slug} />;
}
