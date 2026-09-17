export async function reconcileSession<T>(
  restore: () => Promise<T>,
  authenticate: () => Promise<T>
): Promise<T> {
  try {
    return await restore();
  } catch {
    return authenticate();
  }
}
