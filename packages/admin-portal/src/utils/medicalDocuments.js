import { getMedicalDocumentFile } from "../services/api.js";

/** Open the authenticated document in a browser tab with view, download, and print controls. */
export async function openMedicalDocument(id, name, { print = false } = {}) {
  // Open synchronously from the click handler so the browser does not block it as a popup.
  const viewer = window.open("about:blank", "_blank");
  if (!viewer) throw new Error("Allow pop-ups for this site to view or print the document.");

  try {
    const blob = await getMedicalDocumentFile(id);
    if (!blob?.size) throw new Error("The document file is empty or unavailable.");

    const objectUrl = URL.createObjectURL(blob);
    const doc = viewer.document;
    doc.title = name || "Medical document";

    const style = doc.createElement("style");
    style.textContent = "html,body{height:100%;margin:0;font:14px Arial,sans-serif;color:#172033}body{display:flex;flex-direction:column}.toolbar{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f4f7fb;border-bottom:1px solid #ccd5e0}.filename{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.toolbar button,.toolbar a{font:inherit;padding:7px 12px;border:1px solid #174ea6;border-radius:5px;background:#fff;color:#174ea6;text-decoration:none;cursor:pointer}.viewer{flex:1;width:100%;border:0}";

    const toolbar = doc.createElement("div");
    toolbar.className = "toolbar";
    const label = doc.createElement("strong");
    label.className = "filename";
    label.textContent = name || "Medical document";
    const download = doc.createElement("a");
    download.href = objectUrl;
    download.download = name || "medical-document";
    download.textContent = "Download";
    const printButton = doc.createElement("button");
    printButton.type = "button";
    printButton.textContent = "Print";

    const frame = doc.createElement("iframe");
    frame.className = "viewer";
    frame.title = name || "Medical document";
    frame.src = objectUrl;
    printButton.addEventListener("click", () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    });
    if (print) frame.addEventListener("load", () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    }, { once: true });

    toolbar.append(label, download, printButton);
    doc.body.replaceChildren(style, toolbar, frame);
    viewer.addEventListener("pagehide", () => URL.revokeObjectURL(objectUrl), { once: true });
  } catch (error) {
    viewer.close();
    throw error;
  }
}
