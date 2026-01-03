// static/js/api-services.js

window.apiServices = {
  // --- Hent lister ---
  async getTeknikere() {
    return window.alleTeknikere || [];
  },

  async getStatusverdier() {
    return window.alleStatusverdier || [];
  },

  async getOppgaver(params = {}) {
    const url = new URL("/kalender/data", window.location.origin);
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Feil ved henting av oppgaver (HTTP ${res.status})`);
    return res.json();
  },

  // --- CRUD på oppgave ---
  async deleteOppgave(id) {
    const res = await fetch("/api/slett-oppgave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id })
    });
    if (!res.ok) throw new Error(`Feil ved sletting av oppgave (HTTP ${res.status})`);
    return res.json();
  },

  /**
   * Generisk funksjon for å oppdatere en oppgave med PATCH-metode.
   * Dette er den enhetlige oppdateringsmetoden for alle felt.
   */
  async updateOppgaveFields(id, data) {
    const res = await fetch(`/api/oppgave/${id}`, {
      method: "PATCH", // Use PATCH for all updates to existing tasks
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      let msg = `Feil ved oppdatering av oppgave (HTTP ${res.status})`;
      try {
        const err = await res.json();
        msg += `: ${err.error || JSON.stringify(err)}`;
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  },

  // Alias for drag/resize calls (pointing to the unified PATCH endpoint)
  updateTaskDates(id, data) {
    return this.updateOppgaveFields(id, data);
  },

  // Alias for modal-save calls (pointing to the unified PATCH endpoint)
  saveOppgave(id, data) {
    return this.updateOppgaveFields(id, data);
  },

  // --- Hent enkeltoppgave ---
  async getOppgaveById(id) {
    const res = await fetch(`/api/oppgave/${id}`, { credentials: "include" });
    if (!res.ok) throw new Error(`Feil ved henting av oppgave ${id} (HTTP ${res.status})`);
    return res.json();
  },

  // --- Revisjoner for en oppgave ---
  async getTaskRevisions(taskId) {
    const res = await fetch(`/api/oppgave/${taskId}/revisions`, { credentials: "include" });
    if (!res.ok) throw new Error(`Feil ved henting av revisjoner for oppgave ${taskId} (HTTP ${res.status})`);
    return res.json();
  },

  // --- Helligdager & vedlegg ---
  async getHelligdager() {
    const res = await fetch("/api/helligdager", { credentials: "include" });
    if (!res.ok) throw new Error(`Feil ved henting av helligdager (HTTP ${res.status})`);
    return res.json();
  },

  async getVedlegg(id) {
    const res = await fetch(`/api/vedlegg/${id}`, { credentials: "include" });
    if (!res.ok) throw new Error(`Feil ved henting av vedlegg for ${id} (HTTP ${res.status})`);
    return res.json();
  },

  async getCurrentUser() {
    const res = await fetch("/api/whoami", { credentials: "include" });
    if (!res.ok) throw new Error("Kunne ikke hente innlogget bruker");
    return res.json();
  },
};