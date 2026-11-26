'use client';
import { EddWorkstation, type EddProps } from './EddWorkstation';
export function EddTableView(props: EddProps) {
  return <EddWorkstation key={props.sessionId + ':' + props.stationId} {...props} />;
}
