import boto3
from botocore.config import Config
from backend.core.config import settings
from uuid import uuid4
from typing import BinaryIO


class S3Service:
    def __init__(self) -> None:
        # Basic validation so שנדע מיד אם חסר קונפיגורציה
        if not settings.AWS_S3_BUCKET:
            raise ValueError(
                "AWS_S3_BUCKET is not configured. Please set AWS_S3_BUCKET in your environment/.env file."
            )

        session = boto3.session.Session(
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
        self._s3 = session.client(
            "s3",
            config=Config(s3={"addressing_style": "virtual"}),
        )
        self._bucket = settings.AWS_S3_BUCKET
        self._base_url = settings.AWS_S3_BASE_URL.rstrip("/") if settings.AWS_S3_BASE_URL else None

    def _build_key(self, prefix: str, filename: str) -> str:
        filename = filename or ""
        ext = ""
        if "." in filename:
            ext = "." + filename.split(".")[-1]
        return f"{prefix.rstrip('/')}/{uuid4().hex}{ext}"

    def upload_file(self, *, prefix: str, file_obj: BinaryIO, filename: str | None = None, content_type: str | None = None) -> str:
        key = self._build_key(prefix, filename or "")
        extra_args = {}
        if content_type:
            extra_args["ContentType"] = content_type

        self._s3.upload_fileobj(
            Fileobj=file_obj,
            Bucket=self._bucket,
            Key=key,
            ExtraArgs=extra_args or None,
        )

        if self._base_url:
            return f"{self._base_url}/{key}"
        # Default S3 URL
        return f"https://{self._bucket}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"

    def delete_file(self, file_url: str) -> None:
        """Delete a file from S3 given its URL"""
        # Extract the key from the URL
        key = None
        
        # Try to extract from base_url format
        if self._base_url and file_url.startswith(self._base_url):
            key = file_url.replace(self._base_url + "/", "")
        # Try to extract from default S3 URL format
        elif f"https://{self._bucket}.s3." in file_url:
            # Extract key from URL like: https://bucket.s3.region.amazonaws.com/key
            parts = file_url.split(f"https://{self._bucket}.s3.{settings.AWS_REGION}.amazonaws.com/")
            if len(parts) > 1:
                key = parts[1]
        
        if not key:
            # If we can't extract the key, try to use the file_path as-is (might be a relative path)
            # In this case, we can't delete from S3, so we'll just skip
            return
        
        try:
            self._s3.delete_object(Bucket=self._bucket, Key=key)
        except Exception as e:
            # Log error but don't fail the deletion - the database record will still be deleted
            print(f"Warning: Failed to delete file from S3: {e}")

    def get_file_content(self, file_url: str) -> bytes | None:
        """Get file content from S3 given its URL"""
        key = None
        if self._base_url and file_url.startswith(self._base_url):
            key = file_url.replace(self._base_url + "/", "")
        elif f"https://{self._bucket}.s3." in file_url:
            parts = file_url.split(f"https://{self._bucket}.s3.{settings.AWS_REGION}.amazonaws.com/")
            if len(parts) > 1:
                key = parts[1]
        
        if not key:
            # Assuming file_url might be the key itself if not full URL
            key = file_url
            
        try:
            response = self._s3.get_object(Bucket=self._bucket, Key=key)
            return response['Body'].read()
        except Exception as e:
            print(f"Warning: Failed to download file from S3: {e}")
            return None



