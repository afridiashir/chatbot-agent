-- Documents, alongside photos, video and audio: a PDF quotation, a spreadsheet,
-- the scan of a form. They are stored exactly like any other attachment; what
-- differs is that nothing tries to play or display them, and they are served as
-- a download rather than rendered in the page.
ALTER TYPE "AttachmentKind" ADD VALUE 'FILE';
