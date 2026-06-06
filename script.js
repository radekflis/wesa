const workspaceModules = [
  {
    title: "PDF viewer",
    description: "Opens source material with page-aware context and source anchors.",
  },
  {
    title: "OCR engine",
    description: "Extracts text and tables from scans, maps, images, and reports.",
  },
  {
    title: "Valuation AI",
    description: "Interprets extracted data and proposes valuation document insertions.",
  },
  {
    title: "Spreadsheet extractor",
    description: "Normalizes tables into editable rows with confidence metadata.",
  },
  {
    title: "Source mapping",
    description: "Maintains traceability from live changes back to original evidence.",
  },
  {
    title: "Output workspace",
    description: "Creates an editable environment for final synthesis and review.",
  },
];

const output = document.querySelector("#spawn-output");
const button = document.querySelector("#spawn-workspace");
const query = document.querySelector("#workflow-query");

function renderWorkspace() {
  const intent = query.value.trim() || "contextual workflow";

  output.innerHTML = workspaceModules
    .map(
      (module) => `
        <article class="spawn-pill">
          <strong>${module.title}</strong>
          <span>${module.description}</span>
        </article>
      `,
    )
    .join("");

  output.setAttribute(
    "aria-label",
    `Spawned adaptive workspace for ${intent}`,
  );
}

button.addEventListener("click", renderWorkspace);
query.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    renderWorkspace();
  }
});

renderWorkspace();
