import { createClient } from '@connectrpc/connect'
import { atom } from 'jotai'
import { assistantTransportAtom, publicTransportAtom, transportAtom } from '@/network/transport'
import { DashboardAssistantService } from './genproto/ai/dashboards/v1/assistant_pb'
import { CustomersService } from './genproto/dashboard/customers/v1/customers_pb'
import { DashboardsService } from './genproto/dashboard/dashboards/v1/dashboards_pb'
import { OrgsService } from './genproto/dashboard/orgs/v1/orgs_pb'
import { ProjectsService } from './genproto/dashboard/projects/v1/projects_pb'
import { UsageService } from './genproto/dashboard/usage/v1/usage_pb'
import { AuthService } from './genproto/public/auth/v1/auth_pb'
import { SharedDashboardsService } from './genproto/public/dashboards/v1/dashboards_pb'
import { ActivityService } from './genproto/shared/activity/v1/activity_pb'
import { InsightsService } from './genproto/shared/insights/v1/insights_pb'
import { ProfilesService } from './genproto/shared/profiles/v1/profiles_pb'

// Public (unauthenticated) — every method is credential-free, and on the authenticated transport a
// 401 from CompleteOIDCSignIn would refresh-and-retry, replaying a single-use authorization code.
export const authRPCAtom = atom(get => createClient(AuthService, get(publicTransportAtom)))
// Shared dashboards are read by anonymous visitors — use the credential-free
// transport so a logged-in viewer's JWT is never attached to the public read path.
export const sharedDashboardsRPCAtom = atom(get => createClient(SharedDashboardsService, get(publicTransportAtom)))

// Dashboard — org-scoped (JWT auth)
export const customersRPCAtom = atom(get => createClient(CustomersService, get(transportAtom)))
export const orgsRPCAtom = atom(get => createClient(OrgsService, get(transportAtom)))
export const projectsRPCAtom = atom(get => createClient(ProjectsService, get(transportAtom)))
// Org-scoped despite returning per-project cells: usage spans every project the org owns, so
// GetUsage takes an orgId in the message and no x-project-id header.
export const usageRPCAtom = atom(get => createClient(UsageService, get(transportAtom)))

// Dashboard — project-scoped (JWT auth + x-project-id header from projectHeaderAtom)
export const dashboardsRPCAtom = atom(get => createClient(DashboardsService, get(transportAtom)))
export const insightsRPCAtom = atom(get => createClient(InsightsService, get(transportAtom)))
export const activityRPCAtom = atom(get => createClient(ActivityService, get(transportAtom)))
export const profilesRPCAtom = atom(get => createClient(ProfilesService, get(transportAtom)))

// AI — project-scoped (JWT auth + x-project-id header from projectHeaderAtom), on its own transport
export const dashboardAssistantRPCAtom = atom(get =>
  createClient(DashboardAssistantService, get(assistantTransportAtom)),
)
