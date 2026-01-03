// Legger på prefix på vedleggs‐input
window.initFileUpload = function() {
  let currentOrder = "";
  // Oppdateres av modal‐handlerene
  window.setCurrentOrderNumber = nr => currentOrder = nr;

  const inp = document.getElementById("vedleggInput");
  if (!inp) return;

  inp.addEventListener("change", ev => {
    const ordre = currentOrder || "UkjentOrdre";
    const files = Array.from(ev.target.files).map(f =>
      new File([f], `${ordre}-${f.name}`, { type: f.type })
    );
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    inp.files = dt.files;
  });
};
