/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

// Import Routes

import { Route as rootRoute } from './routes/__root'
import { Route as LeaderScheduleImport } from './routes/leaderSchedule'
import { Route as GossipImport } from './routes/gossip'
import { Route as AboutImport } from './routes/about'
import { Route as IndexImport } from './routes/index'

// Create/Update Routes

const LeaderScheduleRoute = LeaderScheduleImport.update({
  id: '/leaderSchedule',
  path: '/leaderSchedule',
  getParentRoute: () => rootRoute,
} as any)

const GossipRoute = GossipImport.update({
  id: '/gossip',
  path: '/gossip',
  getParentRoute: () => rootRoute,
} as any)

const AboutRoute = AboutImport.update({
  id: '/about',
  path: '/about',
  getParentRoute: () => rootRoute,
} as any)

const IndexRoute = IndexImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRoute,
} as any)

// Populate the FileRoutesByPath interface

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexImport
      parentRoute: typeof rootRoute
    }
    '/about': {
      id: '/about'
      path: '/about'
      fullPath: '/about'
      preLoaderRoute: typeof AboutImport
      parentRoute: typeof rootRoute
    }
    '/gossip': {
      id: '/gossip'
      path: '/gossip'
      fullPath: '/gossip'
      preLoaderRoute: typeof GossipImport
      parentRoute: typeof rootRoute
    }
    '/leaderSchedule': {
      id: '/leaderSchedule'
      path: '/leaderSchedule'
      fullPath: '/leaderSchedule'
      preLoaderRoute: typeof LeaderScheduleImport
      parentRoute: typeof rootRoute
    }
  }
}

// Create and export the route tree

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/about': typeof AboutRoute
  '/gossip': typeof GossipRoute
  '/leaderSchedule': typeof LeaderScheduleRoute
}

export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/about': typeof AboutRoute
  '/gossip': typeof GossipRoute
  '/leaderSchedule': typeof LeaderScheduleRoute
}

export interface FileRoutesById {
  __root__: typeof rootRoute
  '/': typeof IndexRoute
  '/about': typeof AboutRoute
  '/gossip': typeof GossipRoute
  '/leaderSchedule': typeof LeaderScheduleRoute
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/about' | '/gossip' | '/leaderSchedule'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/about' | '/gossip' | '/leaderSchedule'
  id: '__root__' | '/' | '/about' | '/gossip' | '/leaderSchedule'
  fileRoutesById: FileRoutesById
}

export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  AboutRoute: typeof AboutRoute
  GossipRoute: typeof GossipRoute
  LeaderScheduleRoute: typeof LeaderScheduleRoute
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  AboutRoute: AboutRoute,
  GossipRoute: GossipRoute,
  LeaderScheduleRoute: LeaderScheduleRoute,
}

export const routeTree = rootRoute
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

/* ROUTE_MANIFEST_START
{
  "routes": {
    "__root__": {
      "filePath": "__root.tsx",
      "children": [
        "/",
        "/about",
        "/gossip",
        "/leaderSchedule"
      ]
    },
    "/": {
      "filePath": "index.tsx"
    },
    "/about": {
      "filePath": "about.tsx"
    },
    "/gossip": {
      "filePath": "gossip.tsx"
    },
    "/leaderSchedule": {
      "filePath": "leaderSchedule.tsx"
    }
  }
}
ROUTE_MANIFEST_END */
