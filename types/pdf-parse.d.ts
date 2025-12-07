declare module "pdf-parse" {
  interface PDFParseResult {
    text: string;
  }

  function pdfParse(data: Buffer): Promise<PDFParseResult>;

  export = pdfParse;
}
