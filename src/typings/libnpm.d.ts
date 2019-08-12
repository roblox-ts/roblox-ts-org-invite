declare module "libnpmorg" {
  function set (org: string, user: string, role: string, options: { token: string }): Promise<any>
}

declare module "libnpmteam" {
  function create (team: string, options: { token: string }): Promise<any>
  function add (user: string, team: string, options: { token: string }): Promise<any>
}
