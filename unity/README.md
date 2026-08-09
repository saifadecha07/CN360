# Unity project (placeholder)

This folder is where the PICO 4 Unity project will live. It's empty for
now because generating a real Unity project requires the Unity Editor
itself (Assets/, ProjectSettings/, Packages/, and all their metadata
files are created by Unity, not hand-written).

Once Unity Hub + Unity 2022.3 LTS are installed (see [SETUP.md](../SETUP.md)):

1. Unity Hub → New Project → 3D (URP) template
2. Set the location to this `unity/` folder
3. Import the PICO Unity Integration SDK (step 4 in SETUP.md)

A `.gitignore` tuned for Unity is already in place so generated files
(Library/, Temp/, Obj/, Build/, .vs/, etc.) won't get committed once the
project exists here.
