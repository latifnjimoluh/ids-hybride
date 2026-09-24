"""Endpoints d'authentification."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from ..auth import authenticate, change_password, create_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class PasswordChange(BaseModel):
    new_password: str


@router.post("/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends()):
    if not authenticate(form.username, form.password):
        raise HTTPException(status_code=401, detail="Identifiants invalides")
    return TokenResponse(access_token=create_token(form.username), username=form.username)


@router.get("/me")
def me(user: str = Depends(get_current_user)):
    return {"username": user}


@router.post("/change-password")
def change_pwd(payload: PasswordChange, user: str = Depends(get_current_user)):
    if len(payload.new_password) < 4:
        raise HTTPException(status_code=400, detail="Mot de passe trop court (min. 4 caractères)")
    change_password(user, payload.new_password)
    return {"status": "ok"}
