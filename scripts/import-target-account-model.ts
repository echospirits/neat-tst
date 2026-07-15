import fs from 'fs/promises';
import path from 'path';
import { importTargetAccountWorkbook } from '../lib/targetAccountIntelligence';
import { parseTargetAccountWorkbook } from '../lib/targetAccountWorkbook';

const defaultWorkbookPath = 'C:\\Users\\joebl\\Downloads\\Central_Ohio_Target_Account_Model_2026_YTD.xlsx';

const parseArgs = () => {
  const args = process.argv.slice(2);
  const fileFlagIndex = args.findIndex((arg) => arg === '--file');
  const dryRun = args.includes('--dry-run');
  const parseOnly = args.includes('--parse-only');
  const fileFromFlag = fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : null;
  const positionalFile = args.find((arg) => !arg.startsWith('--'));

  return {
    dryRun,
    filePath: fileFromFlag ?? positionalFile ?? defaultWorkbookPath,
    parseOnly,
  };
};

async function main() {
  const { dryRun, filePath, parseOnly } = parseArgs();
  const absolutePath = path.resolve(filePath);
  const buffer = await fs.readFile(absolutePath);

  if (parseOnly) {
    const parsed = await parseTargetAccountWorkbook(buffer);
    console.log(
      JSON.stringify(
        {
          accountRows: parsed.accountRows.length,
          chainRows: parsed.chainRows.length,
          failedRows: parsed.failedRows.length,
          failedRowSamples: parsed.failedRows.slice(0, 5),
          portfolioSkus: parsed.portfolioSkus.length,
          researchQueueRows: parsed.researchQueueRows.length,
          warnings: parsed.warnings,
          mappings: parsed.mappings.map((mapping) => ({
            sheetName: mapping.sheetName,
            missingRequired: mapping.missingRequired,
            missingOptional: mapping.missingOptional,
            rowCount: mapping.rowCount,
          })),
          sheets: parsed.summary.sheets,
        },
        null,
        2,
      ),
    );
    return;
  }

  const result = await importTargetAccountWorkbook({
    buffer,
    dryRun,
    filename: path.basename(absolutePath),
  });

  console.log(
    JSON.stringify(
      {
        importId: result.importId,
        status: result.status,
        stats: result.stats,
        warnings: result.parsed.warnings,
        mappings: result.parsed.mappings.map((mapping) => ({
          sheetName: mapping.sheetName,
          missingRequired: mapping.missingRequired,
          missingOptional: mapping.missingOptional,
          rowCount: mapping.rowCount,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
