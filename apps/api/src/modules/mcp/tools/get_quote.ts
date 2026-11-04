import type { InferSchema, ToolMetadata } from 'xmcp';

import { projectId, readOnly, executeTool } from '../tool-contracts';

export const schema = {
  project_id: projectId,
};

export const metadata: ToolMetadata = {
  name: 'get_quote',
  description:
    "Read the quote of a project: status, currency, module lines with hours and prices, payment milestones, terms, validity and totals. Prices always come from the professional's rate card and estimates; ScopeProfit never suggests prices.",
  annotations: { ...readOnly, title: 'Get quote' },
};

export default async function get_quote(args: InferSchema<typeof schema>) {
  return executeTool((tools, user) => tools.getQuote(user, args.project_id));
}
