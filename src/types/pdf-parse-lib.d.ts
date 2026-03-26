declare module "pdf-parse/lib/pdf-parse.js" {
  type ParsedPdfResult = {
    text?: string;
  };

  function parsePdf(buffer: Buffer): Promise<ParsedPdfResult>;

  export default parsePdf;
}
