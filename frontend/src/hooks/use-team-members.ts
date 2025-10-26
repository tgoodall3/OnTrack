import { useQuery } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TENANT_HEADER = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-contractors";

export type TeamMember = {
  id: string;
  name?: string | null;
  email: string;
  active: boolean;
  roles: Array<{
    id: string;
    name: string;
    key?: string | null;
  }>;
};

async function fetchTeamMembers(): Promise<TeamMember[]> {
  const response = await fetch(`${API_BASE_URL}/users?take=100`, {
    headers: {
      "X-Tenant-ID": TENANT_HEADER,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load team members: ${response.status}`);
  }

  return response.json();
}

export function useTeamMembers() {
  return useQuery<TeamMember[], Error>({
    queryKey: ["team-members"],
    queryFn: fetchTeamMembers,
  });
}

