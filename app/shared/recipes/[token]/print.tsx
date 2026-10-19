"use client";
export function PrintRecipe() {
  return (
    <button className="recipe-print" onClick={() => window.print()}>
      Print training sheet
    </button>
  );
}
