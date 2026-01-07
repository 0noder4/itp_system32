#!/usr/bin/env python
"""
Test script to diagnose SMTP connection issues
Run this from inside the container to see detailed error messages
"""
import os
import sys
import socket
import ssl
import smtplib
from email.mime.text import MIMEText

# Load environment variables
EMAIL_HOST = os.getenv('EMAIL_HOST', 'localhost')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', 1025))
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD')
EMAIL_USE_SSL = os.getenv('EMAIL_USE_SSL', '').lower() in ('true', '1', 'yes')
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', '').lower() in ('true', '1', 'yes')

print(f"Testing SMTP connection to {EMAIL_HOST}:{EMAIL_PORT}")
print(f"Use SSL: {EMAIL_USE_SSL}, Use TLS: {EMAIL_USE_TLS}")
print(f"User: {EMAIL_HOST_USER}")
print("-" * 50)

# Test 1: Basic TCP connection
print("\n1. Testing basic TCP connection...")
try:
    sock = socket.create_connection((EMAIL_HOST, EMAIL_PORT), timeout=10)
    print("✓ TCP connection successful")
    sock.close()
except Exception as e:
    print(f"✗ TCP connection failed: {e}")
    sys.exit(1)

# Test 2: SSL/TLS connection
print("\n2. Testing SSL/TLS connection...")
try:
    if EMAIL_USE_SSL:
        # SSL (port 465) - wrap socket immediately
        print("  Using SSL (immediate SSL wrap)...")
        context = ssl.create_default_context()
        # Try without hostname checking first (for testing)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        
        sock = socket.create_connection((EMAIL_HOST, EMAIL_PORT), timeout=10)
        print("  TCP connected, wrapping with SSL...")
        ssl_sock = context.wrap_socket(sock, server_hostname=EMAIL_HOST)
        print("✓ SSL connection successful")
        
        # Try to read SMTP greeting
        try:
            greeting = ssl_sock.recv(1024).decode('utf-8', errors='ignore')
            print(f"  SMTP greeting: {greeting[:100]}")
        except:
            print("  Note: Could not read SMTP greeting")
        
        ssl_sock.close()
    else:
        # TLS (port 587) - STARTTLS after connection
        print("  Using TLS (STARTTLS)...")
        smtp = smtplib.SMTP(EMAIL_HOST, EMAIL_PORT, timeout=10)
        smtp.set_debuglevel(2)  # Enable debug output
        smtp.starttls()
        print("✓ TLS connection successful")
        smtp.quit()
except Exception as e:
    print(f"✗ SSL/TLS connection failed: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 3: Full SMTP authentication and send
print("\n3. Testing full SMTP authentication...")
if EMAIL_HOST_USER and EMAIL_HOST_PASSWORD:
    try:
        if EMAIL_USE_SSL:
            smtp = smtplib.SMTP_SSL(EMAIL_HOST, EMAIL_PORT, timeout=10)
        else:
            smtp = smtplib.SMTP(EMAIL_HOST, EMAIL_PORT, timeout=10)
            if EMAIL_USE_TLS:
                smtp.starttls()
        
        smtp.set_debuglevel(2)  # Enable debug output
        smtp.login(EMAIL_HOST_USER, EMAIL_HOST_PASSWORD)
        print("✓ Authentication successful")
        
        # Try sending a test email
        msg = MIMEText("Test email from connection test")
        msg['Subject'] = 'Test Email'
        msg['From'] = EMAIL_HOST_USER
        msg['To'] = EMAIL_HOST_USER  # Send to self
        
        smtp.send_message(msg)
        print("✓ Test email sent successfully")
        smtp.quit()
    except Exception as e:
        print(f"✗ Authentication/send failed: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
else:
    print("  Skipped (no credentials provided)")

print("\n" + "=" * 50)
print("All tests passed! Email configuration is working.")
