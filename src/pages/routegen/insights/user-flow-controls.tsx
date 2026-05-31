import { useState } from 'react'
import type { EventNameMeta, GetFilterSchemaResponse } from '@/api/genproto/common/v1/filter_schema_pb'
import { UserFlowQuery_GroupBy, UserFlowQuery_NodeKind } from '@/api/genproto/shared/insights/v1/insights_pb'
import { PropertyPickerList } from '@/components/event-filters'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { OptionChip } from './controls'
import {
  USER_FLOW_GROUP_BY_OPTIONS,
  USER_FLOW_NODE_KIND_OPTIONS,
  type UserFlowConfig,
  type UserFlowScope,
} from './user-flow'
import { UserFlowScopeControls } from './user-flow-scope'

export const UserFlowControls = ({
  config,
  onChange,
  schema,
  schemaError,
  events,
}: {
  config: UserFlowConfig
  onChange: (next: UserFlowConfig) => void
  schema: GetFilterSchemaResponse | null
  schemaError: string | null
  events: EventNameMeta[] | undefined
}) => {
  const [propertyOpen, setPropertyOpen] = useState(false)
  const isProperty = config.nodeKind === UserFlowQuery_NodeKind.PROPERTY

  const setScope = (scope: UserFlowScope) => onChange({ ...config, scope })

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <OptionChip
          label="nodes"
          options={USER_FLOW_NODE_KIND_OPTIONS}
          value={config.nodeKind}
          onChange={nodeKind => onChange({ ...config, nodeKind })}
        />
        {isProperty ? (
          <Popover open={propertyOpen} onOpenChange={setPropertyOpen}>
            <PopoverTrigger className="inline-flex h-7 cursor-pointer items-center overflow-hidden rounded-md border border-border text-xs transition-colors hover:bg-muted/40">
              <span className="flex h-full items-center bg-muted/50 px-2 text-[11px] text-muted-foreground">
                property
              </span>
              <span className={cn('flex h-full items-center px-2', !config.nodeProperty && 'text-muted-foreground')}>
                {config.nodeProperty || 'Select property'}
              </span>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-0">
              <PropertyPickerList
                schema={schema}
                schemaError={schemaError}
                placeholder="Node property..."
                mode={{ kind: 'pick' }}
                onSelect={name => {
                  onChange({ ...config, nodeProperty: name })
                  setPropertyOpen(false)
                }}
              />
            </PopoverContent>
          </Popover>
        ) : null}
        <OptionChip
          label="group by"
          options={USER_FLOW_GROUP_BY_OPTIONS}
          value={config.groupBy}
          onChange={groupBy => onChange({ ...config, groupBy })}
        />
      </div>
      {config.groupBy === UserFlowQuery_GroupBy.USER ? (
        <p className="text-[11px] text-muted-foreground">
          User grouping can link the last event of one session to the first event of the next.
        </p>
      ) : null}
      <UserFlowScopeControls scope={config.scope} onChange={setScope} events={events} schemaError={schemaError} />
    </div>
  )
}
