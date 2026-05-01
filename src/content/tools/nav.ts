export function navBack(): void { history.back() }
export function navForward(): void { history.forward() }
export function navGoto({ url }: { url: string }): void { window.location.href = url }
