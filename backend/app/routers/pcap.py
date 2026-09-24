"""Endpoints d'analyse de captures PCAP (snort -r fichier.pcap)."""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..controllers import get_controller
from ..models import PcapResult, PcapSummary

router = APIRouter(prefix="/api/pcap", tags=["pcap"])

MAX_SIZE = 100 * 1024 * 1024  # 100 Mo


@router.get("", response_model=list[PcapSummary])
def list_pcaps():
    return get_controller().list_pcaps()


@router.post("/analyze", response_model=PcapResult)
async def analyze(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 100 Mo).")
    if not data:
        raise HTTPException(status_code=400, detail="Fichier vide.")
    return get_controller().analyze_pcap(file.filename or "capture.pcap", data)


@router.get("/{pcap_id}", response_model=PcapResult)
def pcap_result(pcap_id: str):
    try:
        return get_controller().get_pcap_result(pcap_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Analyse introuvable")
