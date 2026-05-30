import ExcelJS from 'exceljs';

interface ReviewCheck {
  status: string;
  severity: string;
  explanation?: string;
  rams_evidence?: string;
}

interface Review {
  review_checks?: ReviewCheck[];
}

interface RAMSReportData {
  subcontractor_name: string;
  file_name: string;
  compliance_score: number | null;
  review_status: string;
  projects?: { name: string; compliance_threshold: number } | null;
  rams_reviews?: Review[];
}

export async function generateReportExcel(rams: RAMSReportData) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('RAMS Review Report');

  sheet.addRow(['RAMS Compliance Report']);
  sheet.addRow(['Project:', rams.projects?.name ?? '']);
  sheet.addRow(['Subcontractor:', rams.subcontractor_name]);
  sheet.addRow(['File:', rams.file_name]);
  sheet.addRow(['Score:', rams.compliance_score != null ? `${rams.compliance_score}%` : 'N/A']);
  sheet.addRow(['Status:', rams.review_status]);
  sheet.addRow([]);

  const review = rams.rams_reviews?.[0];
  if (review?.review_checks?.length) {
    sheet.addRow(['Requirement Checks']);
    sheet.addRow(['Status', 'Severity', 'Explanation', 'Evidence']);

    for (const check of review.review_checks) {
      sheet.addRow([
        check.status,
        check.severity,
        check.explanation ?? '',
        check.rams_evidence ?? '',
      ]);
    }
  }

  for (const column of sheet.columns) {
    column.width = 40;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}
