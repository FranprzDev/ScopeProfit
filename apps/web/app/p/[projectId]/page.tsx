import { Suspense } from 'react';
import { ProjectWorkspace } from '@/components/project-workspace';
export default async function ProjectPage({params}:{params:Promise<{projectId:string}>}){const{projectId}=await params;return <Suspense fallback={<main className="page wide">Cargando proyecto…</main>}><ProjectWorkspace projectId={projectId}/></Suspense>;}
