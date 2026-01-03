import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import GanttView from "../components/GanttView";

describe("GanttView", () => {
  it("viser tom-tekst når ingen oppgaver eksisterer", () => {
    render(
      <GanttView
        tasks={[]}
        dependencies={[]}
        selectedTaskId={null}
        onTaskSelect={() => undefined}
        onTaskChange={() => undefined}
      />
    );

    expect(screen.getByText("Ingen oppgaver ennå.")).toBeInTheDocument();
  });
});
