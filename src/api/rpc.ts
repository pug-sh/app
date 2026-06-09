import { createClient } from '@connectrpc/connect'
import { atom } from 'jotai'
import { transportAtom } from '@/network/transport'
import { CustomersService } from './genproto/dashboard/customers/v1/customers_pb'
import { DashboardsService } from './genproto/dashboard/dashboards/v1/dashboards_pb'
import { OrgEmailProvidersService } from './genproto/dashboard/orgemailproviders/v1/orgemailproviders_pb'
import { OrgsService } from './genproto/dashboard/orgs/v1/orgs_pb'
import { ProjectsService } from './genproto/dashboard/projects/v1/projects_pb'
import { AuthService } from './genproto/public/auth/v1/auth_pb'
import { SharedDashboardsService } from './genproto/public/dashboards/v1/dashboards_pb'
import { ActivityService } from './genproto/shared/activity/v1/activity_pb'
import { InsightsService } from './genproto/shared/insights/v1/insights_pb'
import { ProfilesService } from './genproto/shared/profiles/v1/profiles_pb'

// Public (unauthenticated)
export const authRPCAtom = atom(get => createClient(AuthService, get(transportAtom)))
export const sharedDashboardsRPCAtom = atom(get => createClient(SharedDashboardsService, get(transportAtom)))

// Dashboard — org-scoped (JWT auth)
export const customersRPCAtom = atom(get => createClient(CustomersService, get(transportAtom)))
export const orgsRPCAtom = atom(get => createClient(OrgsService, get(transportAtom)))
export const orgEmailProvidersRPCAtom = atom(get => createClient(OrgEmailProvidersService, get(transportAtom)))
export const projectsRPCAtom = atom(get => createClient(ProjectsService, get(transportAtom)))

// Dashboard — project-scoped (JWT auth + x-project-id header from projectHeaderAtom)
export const dashboardsRPCAtom = atom(get => createClient(DashboardsService, get(transportAtom)))
export const insightsRPCAtom = atom(get => createClient(InsightsService, get(transportAtom)))
export const activityRPCAtom = atom(get => createClient(ActivityService, get(transportAtom)))
export const profilesRPCAtom = atom(get => createClient(ProfilesService, get(transportAtom)))
