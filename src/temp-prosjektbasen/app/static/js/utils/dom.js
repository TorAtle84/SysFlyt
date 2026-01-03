// små DOM‐hjelper‐funksjoner
window.domHelpers = {
  setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? "";
  },
  createOption(text, value) {
    const o = document.createElement("option");
    o.text = text; o.value = value;
    return o;
  }
};
