export const INFERENCE_RESULTS_PAGE_SIZE = 20;

export function paginateResults<T>(items: T[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / INFERENCE_RESULTS_PAGE_SIZE));
  const page = Math.min(Math.max(0, requestedPage), pageCount - 1);
  return { page, pageCount, items: items.slice(page * INFERENCE_RESULTS_PAGE_SIZE, (page + 1) * INFERENCE_RESULTS_PAGE_SIZE) };
}
