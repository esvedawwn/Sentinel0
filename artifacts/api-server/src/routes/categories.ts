import { Router, type IRouter } from "express";

const router: IRouter = Router();

const CATEGORIES = [
  {
    id: "Legal",
    name: "Legal",
    label: "Legal",
    icon: "Legal",
    subfolders: ["Court-Documents", "Contracts", "Correspondence", "Evidence", "ID-Certificates", "_Archive"],
    extensions: [".pdf", ".docx", ".jpg", ".png", ".mp4", ".eml", ".msg"],
    tags: ["legal", "court", "contract", "affidavit", "evidence", "solicitor", "ID"],
  },
  {
    id: "Banking",
    name: "Banking",
    label: "Banking & Finance",
    icon: "Banking",
    subfolders: ["Statements", "Invoices", "Receipts", "Tax", "Insurance", "_Archive"],
    extensions: [".pdf", ".csv", ".xlsx", ".jpg", ".png"],
    tags: ["bank", "statement", "invoice", "tax", "receipt", "insurance"],
  },
  {
    id: "Design",
    name: "Design",
    label: "Design",
    icon: "Design",
    subfolders: ["PSD-Source-Files", "Exports", "Branding", "Mockups", "Fonts", "_Archive"],
    extensions: [".psd", ".ai", ".indd", ".xd", ".fig", ".png", ".jpg", ".svg", ".webp", ".tiff", ".otf", ".ttf", ".woff", ".woff2"],
    tags: ["design", "photoshop", "illustrator", "logo", "export", "mockup", "font", "branding"],
  },
  {
    id: "Templates",
    name: "Templates",
    label: "Templates",
    icon: "Templates",
    subfolders: ["Documents", "Spreadsheets", "Presentations", "Design-Templates"],
    extensions: [".docx", ".dotx", ".pdf", ".xlsx", ".xltx", ".csv", ".pptx", ".potx", ".key", ".psd", ".ai", ".sketch", ".xd"],
    tags: ["template", "reusable", "blank", "form", "letterhead"],
  },
  {
    id: "Screenshots",
    name: "Screenshots",
    label: "Screenshots",
    icon: "Screenshots",
    subfolders: ["Desktop", "Mobile", "Screen-Recordings"],
    extensions: [".png", ".jpg", ".bmp", ".heic", ".mp4", ".mov", ".gif", ".webm"],
    tags: ["screenshot", "capture", "screen", "recording", "mobile"],
  },
  {
    id: "Security",
    name: "Security",
    label: "Passwords & Recovery",
    icon: "Security",
    subfolders: ["Passwords", "Recovery-Codes", "Licences-Keys"],
    extensions: [".kdbx", ".csv", ".1pux", ".txt", ".pdf", ".png", ".lic", ".key"],
    tags: ["password", "recovery", "2FA", "licence-key", "serial", "backup"],
  },
  {
    id: "Media",
    name: "Media",
    label: "Photos & Media",
    icon: "Media",
    subfolders: ["Photos", "Videos", "Audio", "GIFs-Stickers"],
    extensions: [".jpg", ".png", ".heic", ".raw", ".cr2", ".mp4", ".mov", ".avi", ".mkv", ".wmv", ".mp3", ".wav", ".aac", ".flac", ".m4a", ".gif", ".webp", ".apng"],
    tags: ["photo", "video", "audio", "music", "camera", "gif"],
  },
  {
    id: "Documents",
    name: "Documents",
    label: "Documents",
    icon: "Documents",
    subfolders: ["Personal", "Work-Business", "Reference", "Scans"],
    extensions: [".pdf", ".docx", ".txt", ".xlsx", ".pptx", ".epub", ".md", ".tiff"],
    tags: ["document", "personal", "medical", "business", "scan", "reference"],
  },
  {
    id: "Projects",
    name: "Projects",
    label: "Projects",
    icon: "Projects",
    subfolders: ["Assets", "Docs", "Exports"],
    extensions: [],
    tags: ["project", "client", "active", "WIP", "deliverable"],
  },
  {
    id: "Downloads",
    name: "Downloads",
    label: "Downloads",
    icon: "Downloads",
    subfolders: ["Software", "Archives", "Unsorted"],
    extensions: [".exe", ".dmg", ".msi", ".pkg", ".zip", ".rar", ".7z", ".tar", ".gz"],
    tags: ["download", "temp", "misc", "unknown", "triage"],
  },
];

router.get("/categories", async (_req, res): Promise<void> => {
  res.json(CATEGORIES);
});

export default router;
