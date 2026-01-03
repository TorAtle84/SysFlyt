import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "../App";

vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
  const url = typeof input === "string" ? input : input.url;

  if (url.includes("/sluplan/api/resources")) {
    return {
      ok: true,
      json: async () => ({
        users: [
          {
            id: 1,
            name: "Ola Nordmann",
            email: "ola@example.com",
            first_name: "Ola",
            last_name: "Nordmann",
            fag: "Elektro",
            role: "Ingeniør",
            location: "Oslo"
          }
        ],
        disciplines: []
      })
    } as Response;
  }

  if (url.includes("/sluplan/api/projects") && !url.includes("/base")) {
    return {
      ok: true,
      json: async () => ({
        projects: [
          {
            id: 1,
            name: "Testprosjekt",
            order_number: "123",
            start_date: "2024-01-01",
            end_date: "2024-02-01",
            project_id: null,
            project_name: null,
            location: "Oslo"
          }
        ]
      })
    } as Response;
  }

  if (url.includes("/sluplan/api/tasks")) {
    return {
      ok: true,
      json: async () => ({
        project: {
          id: 1,
          name: "Testprosjekt",
          order_number: "123",
          start_date: "2024-01-01",
          end_date: "2024-02-01",
          project_id: null,
          project_name: null,
          location: "Oslo"
        },
        tasks: [
          {
            id: "1",
            title: "Testoppgave",
            start: "2024-01-01",
            end: "2024-01-02",
            status: "planlagt",
            assignee: "Ola Nordmann",
            kind: "task",
            children: [],
            comments: [],
            files: []
          }
        ],
        dependencies: []
      })
    } as Response;
  }

  if (url.includes("/sluplan/api/alerts")) {
    return {
      ok: true,
      json: async () => ({
        generated_at: new Date().toISOString(),
        reference_date: "2024-01-01",
        upcoming: [],
        today: [],
        overdue: []
      })
    } as Response;
  }

  throw new Error(`Uventet fetch: ${url}`);
}));

describe("SluPlan App", () => {
  it("viser hovedoverskriften og laster oppgaver", async () => {
    render(<App />);

    expect(await screen.findByText(/SluPlan – fremdriftsplanlegging/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("Testoppgave").length).toBeGreaterThan(0);
    });
  });
});
