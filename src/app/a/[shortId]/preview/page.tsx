import { notFound } from "next/navigation";
import Link from "next/link";
import { getAgreementByShortId } from "@/lib/db/queries";
import { RegenerateTemplateButton } from "./RegenerateTemplateButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ shortId: string }>;
}

/**
 * Phase D.1 — HTML preview of the Opus-generated template.
 *
 * Renders the stored template inside an iframe (via srcDoc) so its CSS is
 * fully isolated from the host page's Tailwind chrome. The iframe content
 * mirrors what Puppeteer will eventually rasterize into a PDF in D.2 — so
 * if it looks right here, it'll look right there.
 *
 * Soft-fail: if template_html is NULL on the agreement row, we render a
 * recovery surface with a Retry button instead.
 */
export default async function PreviewPage({ params }: PageProps) {
  const { shortId } = await params;
  const agreement = await getAgreementByShortId(shortId);

  if (!agreement) {
    notFound();
  }

  if (!agreement.templateHtml) {
    return (
      <main className="min-h-screen bg-neutral-50 text-neutral-900">
        <div className="max-w-2xl mx-auto px-5 py-12 sm:px-6 sm:py-16">
          <PageHeader agreement={agreement} />
          <div className="mt-8 rounded-md border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-lg font-semibold text-amber-900">
              Template generation failed
            </h2>
            <p className="mt-2 text-sm text-amber-800 leading-relaxed">
              We extracted the schema and style fingerprint successfully, but the
              HTML template generation pass failed. This is a soft-fail — your
              agreement is intact and the form is still usable. You can retry
              the template pass below.
            </p>
            <RegenerateTemplateButton agreementId={agreement.id} />
          </div>
        </div>
      </main>
    );
  }

  const renderedHtml = composeRenderedHtml({
    templateHtml: agreement.templateHtml,
    templateCss: agreement.templateCss,
    fontImports: agreement.fontImports,
    agreementId: agreement.id,
  });

  return (
    <main className="min-h-screen bg-neutral-100 text-neutral-900">
      <div className="border-b border-neutral-200 bg-white">
        <div className="max-w-6xl mx-auto px-5 py-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              Phase D.1 preview · {agreement.schema.documentType}
            </div>
            <h1 className="mt-1 text-lg font-semibold tracking-tight truncate">
              {agreement.schema.title}
            </h1>
          </div>
          <div className="flex items-center gap-3 shrink-0 text-sm">
            <Link
              href={`/a/${agreement.shortId}/compare`}
              className="text-neutral-700 hover:text-neutral-900 underline-offset-2 hover:underline"
            >
              Compare (dev)
            </Link>
            <Link
              href={`/a/${agreement.shortId}`}
              className="text-neutral-700 hover:text-neutral-900 underline-offset-2 hover:underline"
            >
              Open form →
            </Link>
            <RegenerateTemplateButton agreementId={agreement.id} compact />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 py-6 sm:px-6">
        <div className="rounded-md border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <iframe
            srcDoc={renderedHtml}
            title={`${agreement.schema.title} — generated template`}
            className="w-full border-0"
            style={{ height: "calc(100vh - 180px)" }}
            sandbox="allow-same-origin"
          />
        </div>
        <p className="mt-4 text-xs text-neutral-500 leading-relaxed">
          This preview shows the Opus-generated HTML template that Phase D.2
          will hand to Puppeteer for PDF rendering. Field placeholders
          (<code className="font-mono">[data-field]</code>) appear empty — D.2
          injects submission values before render.
        </p>
      </div>
    </main>
  );
}

function PageHeader({
  agreement,
}: {
  agreement: { schema: { documentType: string; title: string }; shortId: string };
}) {
  return (
    <header className="mb-6">
      <div className="text-xs uppercase tracking-wide text-neutral-500">
        Phase D.1 preview · {agreement.schema.documentType}
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {agreement.schema.title}
      </h1>
      <div className="mt-2 text-xs text-neutral-400">
        <code className="font-mono">{agreement.shortId}</code>
      </div>
    </header>
  );
}

interface ComposeArgs {
  templateHtml: string;
  templateCss: string | null;
  fontImports: string[];
  agreementId: string;
}

/**
 * Inject font imports + templateCss into the template's <head>, and
 * substitute the agreementId placeholder for logo references. Returns
 * the final HTML to drop into the iframe's srcDoc.
 */
function composeRenderedHtml({
  templateHtml,
  templateCss,
  fontImports,
  agreementId,
}: ComposeArgs): string {
  const fontLinks = fontImports
    .map(
      (url) =>
        `<link rel="stylesheet" href="${escapeHtmlAttribute(url)}" data-signflo-font />`,
    )
    .join("\n");
  const cssBlock = templateCss
    ? `<style data-signflo-template-css>\n${templateCss}\n</style>`
    : "";
  const injection = `${fontLinks}\n${cssBlock}`;

  let html = templateHtml.replace(
    /\{\{AGREEMENT_ID_PLACEHOLDER\}\}/g,
    encodeURIComponent(agreementId),
  );

  if (html.includes("</head>")) {
    html = html.replace("</head>", `${injection}\n</head>`);
  } else {
    html = `<!DOCTYPE html><html><head>${injection}</head><body>${html}</body></html>`;
  }

  return html;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
