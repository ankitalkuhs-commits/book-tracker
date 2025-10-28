from passlib.context import CryptContext
from passlib.hash import bcrypt

# Test basic bcrypt functionality
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

try:
    # Test 1: Direct bcrypt hash
    print("Testing direct bcrypt hash...")
    test_hash = bcrypt.hash("testpassword")
    print("Direct bcrypt hash successful:", test_hash)
    
    # Test 2: CryptContext hash
    print("\nTesting CryptContext hash...")
    ctx_hash = pwd_context.hash("testpassword")
    print("CryptContext hash successful:", ctx_hash)
    
    # Test 3: Hash verification
    print("\nTesting hash verification...")
    is_valid = pwd_context.verify("testpassword", ctx_hash)
    print("Hash verification successful:", is_valid)
    
except Exception as e:
    print("\nError occurred:")
    print(type(e).__name__, ":", str(e))