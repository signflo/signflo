/**
 * Generate a synthetic 3-page agreement as 3 PNG images for testing the
 * multi-page ingest pipeline. Output goes to:
 *   test-corpus/multi-page-bicycle-agreement/page-{1,2,3}.png
 *
 * Run with: npx tsx scripts/generate-test-multipage.ts
 *
 * The doc is deliberately synthetic — no real party data — and is shaped
 * to exercise:
 *   • Section grouping (Buyer Info, Bicycle Info, Sale Terms, etc.)
 *   • Mixed field types (text, date, number, checkbox, radio)
 *   • Multi-party signatures (Buyer = self, Seller = counterparty, Witness = counterparty)
 *   • Conditional completion (warranty acknowledgement)
 *   • Multi-page assembly (terms span pages 1 + 2; signatures on page 3)
 */
import puppeteer from "puppeteer";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const OUT_DIR = resolve(process.cwd(), "test-corpus/multi-page-bicycle-agreement");

const STYLE = `
  body {
    margin: 0;
    padding: 60px 80px;
    font-family: 'Times New Roman', Times, serif;
    color: #111;
    background: #fff;
    font-size: 14px;
    line-height: 1.4;
  }
  h1 { text-align: center; font-size: 22px; margin: 0 0 8px; letter-spacing: 1px; }
  h2 { font-size: 14px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #888; text-transform: uppercase; letter-spacing: 0.5px; }
  .meta { text-align: center; color: #555; font-size: 11px; margin-bottom: 24px; }
  .row { display: flex; align-items: baseline; gap: 8px; margin: 10px 0; }
  .row label { white-space: nowrap; }
  .blank { flex: 1; border-bottom: 1px solid #333; min-width: 80px; height: 18px; }
  .blank.short { flex: 0 0 120px; }
  .blank.medium { flex: 0 0 220px; }
  .checkbox { display: inline-block; width: 12px; height: 12px; border: 1px solid #333; vertical-align: middle; margin-right: 6px; }
  .check-label { margin-right: 18px; display: inline-flex; align-items: center; }
  .clause { margin: 10px 0; text-align: justify; }
  .pagefoot { position: fixed; bottom: 30px; left: 0; right: 0; text-align: center; font-size: 10px; color: #888; letter-spacing: 1px; }
  .sig-block { margin-top: 18px; padding: 10px 12px; border: 1px solid #ccc; background: #fafafa; }
  .sig-block .role { font-size: 11px; text-transform: uppercase; color: #555; letter-spacing: 0.6px; margin-bottom: 8px; }
  .sig-block .lines { display: grid; grid-template-columns: 2fr 1fr; gap: 14px; }
  .sig-block .lines > div { display: flex; flex-direction: column; }
  .sig-block .lines .underline { border-bottom: 1px solid #333; height: 22px; }
  .sig-block .lines .caption { font-size: 10px; color: #555; margin-top: 4px; }
`;

const PAGE_1 = `
  <h1>BICYCLE PURCHASE AGREEMENT</h1>
  <div class="meta">Page 1 of 3 — Terms and Identification</div>

  <h2>Agreement</h2>
  <p class="clause">
    This Bicycle Purchase Agreement (the "Agreement") is entered into on
    the date set forth below by and between the Seller and the Buyer
    identified herein for the sale of the bicycle described below.
  </p>
  <div class="row"><label>Effective Date:</label><div class="blank medium"></div></div>

  <h2>Buyer Information</h2>
  <div class="row"><label>Buyer Full Name:</label><div class="blank"></div></div>
  <div class="row"><label>Address:</label><div class="blank"></div></div>
  <div class="row">
    <label>City:</label><div class="blank short"></div>
    <label>State:</label><div class="blank short"></div>
    <label>ZIP:</label><div class="blank short"></div>
  </div>
  <div class="row"><label>Phone:</label><div class="blank medium"></div><label>Email:</label><div class="blank"></div></div>

  <h2>Seller Information</h2>
  <div class="row"><label>Seller Full Name:</label><div class="blank"></div></div>
  <div class="row"><label>Seller Address:</label><div class="blank"></div></div>
  <div class="row"><label>Seller Phone:</label><div class="blank medium"></div><label>Email:</label><div class="blank"></div></div>

  <h2>Bicycle Description</h2>
  <div class="row"><label>Make:</label><div class="blank short"></div><label>Model:</label><div class="blank"></div></div>
  <div class="row"><label>Year:</label><div class="blank short"></div><label>Color:</label><div class="blank short"></div><label>Frame Size:</label><div class="blank short"></div></div>
  <div class="row"><label>Serial Number:</label><div class="blank medium"></div></div>

  <div class="pagefoot">BICYCLE PURCHASE AGREEMENT — PAGE 1 OF 3</div>
`;

const PAGE_2 = `
  <h1>BICYCLE PURCHASE AGREEMENT</h1>
  <div class="meta">Page 2 of 3 — Sale Terms and Payment</div>

  <h2>Sale Terms</h2>
  <div class="row"><label>Sale Price (USD):</label> $ <div class="blank short"></div></div>
  <div class="row"><label>In words:</label><div class="blank"></div></div>

  <h2>Payment Method</h2>
  <p class="clause">Buyer agrees to pay the Sale Price by ONE of the following methods (check one):</p>
  <div>
    <span class="check-label"><span class="checkbox"></span>Cash</span>
    <span class="check-label"><span class="checkbox"></span>Personal Check</span>
    <span class="check-label"><span class="checkbox"></span>Bank Transfer</span>
    <span class="check-label"><span class="checkbox"></span>Other:</span><span class="blank short" style="display:inline-block; width:140px;"></span>
  </div>

  <h2>Condition and Warranty</h2>
  <p class="clause">The bicycle is sold (check one):</p>
  <div>
    <span class="check-label"><span class="checkbox"></span>As-is, with no express or implied warranties</span>
    <span class="check-label"><span class="checkbox"></span>With limited Seller warranty as described below</span>
  </div>
  <div class="row"><label>If warranty selected, describe coverage and duration:</label></div>
  <div class="row"><div class="blank"></div></div>
  <div class="row"><div class="blank"></div></div>

  <h2>Buyer Acknowledgements</h2>
  <div>
    <div><span class="checkbox"></span> Buyer has personally inspected the bicycle prior to purchase.</div>
    <div style="margin-top:6px"><span class="checkbox"></span> Buyer has received the bicycle in the working condition represented by Seller.</div>
    <div style="margin-top:6px"><span class="checkbox"></span> Buyer accepts that no further claims may be made except as provided under the warranty section above (if applicable).</div>
  </div>

  <h2>Risk of Loss</h2>
  <p class="clause">
    Risk of loss passes to Buyer at the time of physical delivery. Seller
    represents that, to the best of Seller's knowledge, the bicycle is not
    stolen, encumbered, or subject to any lien at the time of sale.
  </p>

  <div class="pagefoot">BICYCLE PURCHASE AGREEMENT — PAGE 2 OF 3</div>
`;

const PAGE_3 = `
  <h1>BICYCLE PURCHASE AGREEMENT</h1>
  <div class="meta">Page 3 of 3 — Signatures</div>

  <h2>Acceptance and Signatures</h2>
  <p class="clause">
    By signing below, the parties confirm they have read and understood
    pages 1 and 2 of this Agreement and agree to be bound by its terms.
  </p>

  <div class="sig-block">
    <div class="role">Buyer</div>
    <div class="lines">
      <div><span class="underline"></span><span class="caption">Buyer Signature</span></div>
      <div><span class="underline"></span><span class="caption">Date</span></div>
    </div>
    <div class="row" style="margin-top:10px"><label>Print Name:</label><div class="blank"></div></div>
  </div>

  <div class="sig-block">
    <div class="role">Seller</div>
    <div class="lines">
      <div><span class="underline"></span><span class="caption">Seller Signature</span></div>
      <div><span class="underline"></span><span class="caption">Date</span></div>
    </div>
    <div class="row" style="margin-top:10px"><label>Print Name:</label><div class="blank"></div></div>
  </div>

  <div class="sig-block">
    <div class="role">Witness (optional)</div>
    <div class="lines">
      <div><span class="underline"></span><span class="caption">Witness Signature</span></div>
      <div><span class="underline"></span><span class="caption">Date</span></div>
    </div>
    <div class="row" style="margin-top:10px"><label>Print Name:</label><div class="blank"></div></div>
  </div>

  <p class="clause" style="margin-top:24px; font-size: 11px; color: #555;">
    Retain a signed copy for your records. This Agreement is governed by
    the laws of the state in which the sale takes place.
  </p>

  <div class="pagefoot">BICYCLE PURCHASE AGREEMENT — PAGE 3 OF 3</div>
`;

async function renderPage(html: string, outPath: string) {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>${html}</body></html>`,
      { waitUntil: "networkidle0" },
    );
    await page.screenshot({ path: outPath as `${string}.png`, fullPage: false });
  } finally {
    await browser.close();
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const targets: Array<[string, string]> = [
    [PAGE_1, `${OUT_DIR}/page-1.png`],
    [PAGE_2, `${OUT_DIR}/page-2.png`],
    [PAGE_3, `${OUT_DIR}/page-3.png`],
  ];
  for (const [html, out] of targets) {
    console.log(`rendering ${out} …`);
    await renderPage(html, out);
  }
  console.log(`done — 3 pages at ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
