"""Check controlled source failure, lease recovery, and report persistence access."""
import argparse
import hashlib
from pathlib import Path
import secrets
import subprocess
import time

import httpx

from acceptance import wait_job
from jupiter.db import engine, one, query

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--base",default="http://localhost:8080")
    parser.add_argument("--windows-worker",action="store_true")
    args=parser.parse_args()
    client=httpx.Client(base_url=args.base+"/api",timeout=15,headers={"Origin":args.base})
    password=secrets.token_urlsafe(18)
    user=client.post("/auth/register",json={"email":f"recovery-{secrets.token_hex(5)}@example.org",
                                          "name":"Prueba de recuperación","password":password}).raise_for_status().json()
    client.headers["X-CSRF-Token"]=user["csrf"]
    site=client.get("/fields").raise_for_status().json()[0]
    if args.windows_worker:
        import shutil
        shell=shutil.which("pwsh.exe") or "powershell.exe"
        worker_pid=int(Path(".local/worker.pid").read_text())
        subprocess.run(["taskkill","/F","/PID",str(worker_pid)],capture_output=True,check=True)
    try:
        task=client.post(f"/fields/{site['id']}/analyses",json={"previous":"maize","irrigation":"rainfed","priority":"water","trial":True}).raise_for_status().json()
        if args.windows_worker:
            # Model the state left by a worker terminated after acquiring a lease.
            with engine.begin() as conn:
                query(conn,"""UPDATE jobs SET status='running',attempts=1,lease=gen_random_uuid(),
                    lease_until=now()-interval '1 second' WHERE id=:i""",i=task["job_id"])
    finally:
        if args.windows_worker:
            subprocess.run([shell,"-NoProfile","-File","scripts/start-windows.ps1"],check=True)
    wait_job(client,task,timeout=65)
    with engine.connect() as conn:
        count=one(conn,"SELECT count(*) FROM results WHERE run_id=:i",i=task["target_id"])["count"]
    assert count==1
    result=client.get("/analyses/"+task["target_id"]).raise_for_status().json()["result"]
    assert result["alternatives"][0]["crops"]==["maize","cover","sorghum"]
    if args.windows_worker:
        assert client.get("/jobs/"+task["job_id"]).json()["attempts"]==2
    report=client.post("/analyses/"+task["target_id"]+"/reports",
                       json={"rotation_id":result["alternatives"][0]["id"]}).raise_for_status().json()
    wait_job(client,report,timeout=90)
    pdf=f"/reports/{report['target_id']}/pdf"
    before=client.get(pdf).raise_for_status().content
    if args.windows_worker:
        subprocess.run([shell,"-NoProfile","-File","scripts/stop-windows.ps1"],check=True)
        subprocess.run([shell,"-NoProfile","-File","scripts/start-windows.ps1"],check=True)
    assert hashlib.sha256(client.get(pdf).raise_for_status().content).digest()==hashlib.sha256(before).digest()
    with engine.connect() as conn:
        assert one(conn,"SELECT count(*) FROM reports WHERE id=:i",i=report["target_id"])["count"]==1
    print("Recuperación de lease y persistencia de informe verificadas.")

if __name__=="__main__":
    main()
