import type {AnalyticsProvider} from '../contracts/analytics.ts';
export type AnalyticsOwnerContext={id:string;generation:object}|null;
export type AnalyticsSelection={ownerId:string;generation:object;provider:AnalyticsProvider;period:7|30;page:number;revision:number};
export function isAnalyticsSelectionCurrent(captured:AnalyticsSelection,current:AnalyticsSelection|null):boolean {
  return !!current&&captured.ownerId===current.ownerId&&captured.generation===current.generation&&captured.provider===current.provider&&captured.period===current.period&&captured.page===current.page&&captured.revision===current.revision;
}
