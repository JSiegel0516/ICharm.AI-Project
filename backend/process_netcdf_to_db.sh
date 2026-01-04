#!/usr/bin/env bash

# The shebang above may look different from a usual one (usually: #"/usr/bin/bash)
# The above is better as it looks for whatever "bash" has been setup and doesn't care about the location
# In my case, since I'm on Nixos it has to be the above.

# Some background on the next line for you guys
# -e : Exit on error (otherwise the script would continue running even if we ran into an error)
# -u : Error on Undefined variables ie: If ${ICHARM_DB_NAME} doesn't get pulled from source, then it'll fail
# -o pipefail: Errors on any failure in a pip of commands: cat somefile.txt | grep "some text" | ... |
#              If any of those calls fail, error out.
set -euo pipefail

# Source the environment variables
source ../.env.local

# This part is just for my Nixos environment as there was a library missing in my path
if [[ -n "${NIX_LD_LIBRARY_PATH:-}" ]]; then
  export LD_LIBRARY_PATH="${NIX_LD_LIBRARY_PATH}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

  # Test that above fixes the issue
  ../.venv/bin/python -c "import numpy"
fi

# Running the actual script. I'm calling the python from the "venv" and then referencing the "__main__.py" file
# and passing all the necessary arguments to it.
# You should be able to use this style to import a lot of different netcdf files
../.venv/bin/python -m icharm.dataset_processing.netcdf_to_db \
  simple \
  --db_name "ncep_air" \
  --db_host "${POSTGRES_HOSTNAME}" \
  --db_user "${POSTGRES_USERNAME}" \
  --db_password "${POSTGRES_PASSWORD}" \
  --folder_root "../backend/datasets/ncep" \
  --variable_of_interest_name "air"
