export const DISCIPLINES = [
  { value: "Elektro", label: "Elektro" },
  { value: "Ventilasjon", label: "Ventilasjon" },
  { value: "Kulde", label: "Kulde" },
  { value: "Byggautomasjon", label: "Byggautomasjon" },
  { value: "Rørlegger", label: "Rørlegger" },
  { value: "Administrasjon", label: "Administrasjon" },
  { value: "Totalentreprenør", label: "Totalentreprenør" },
  { value: "Byggherre", label: "Byggherre" },
  { value: "Annet", label: "Annet" },
] as const;

export type Discipline = typeof DISCIPLINES[number]["value"];
