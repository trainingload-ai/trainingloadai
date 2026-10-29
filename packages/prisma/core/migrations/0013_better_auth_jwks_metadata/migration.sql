-- Better Auth 1.7 stores the signing algorithm and curve with each JSON Web Key.
-- Existing keys remain valid: null means the configured/default algorithm and curve.
ALTER TABLE "t_jwks"
ADD COLUMN "alg" TEXT,
ADD COLUMN "crv" TEXT;
