#!/bin/bash

# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

# shellcheck disable=SC1090
set -eo pipefail

export resourceGroupName
export resourceName

exitWithUsageInfo() {
    echo "
Usage: $0 -o <organisation name> -p <publisher email> -r <resource group> -e <environment>
    where 
    Organisation Name - This name will be used in customer interactions
    Publisher email - The email for notifications
    Resource group - The resource group that this API instance needs to be added to
"
    exit 1
}

# Set default Api gateway template file
templateFilePath="${0%/*}/../templates/api-management.template.json"

# Read script arguments
while getopts ":o:p:r:e:" option; do
    case $option in
    o) orgName=${OPTARG} ;;
    p) publisherEmail=${OPTARG} ;;
    r) resourceGroupName=${OPTARG} ;;
    e) environment=${OPTARG} ;;
    *) exitWithUsageInfo ;;
    esac
done

if [[ -z $orgName ]] || [[ -z $publisherEmail ]] || [[ -z $resourceGroupName ]] || [[ -z $environment ]]; then
    exitWithUsageInfo
fi

if [ $environment = "prod" ] || [ $environment = "ppe" ] || [ $environment = "prod-pr" ] || [ $environment = "ppe-pr" ]; then
    tier="Standard"
else
    tier="Developer"
fi

# Start deployment
echo "[create-api-management] Deploying API management instance. This might take up to 45 mins"

resources=$(az deployment group create \
    --resource-group "$resourceGroupName" \
    --template-file "$templateFilePath" \
    --parameters adminEmail="$publisherEmail" orgName="$orgName" tier="$tier" \
    --query "properties.outputResources[].id" \
    -o tsv)

. "${0%/*}/get-resource-name-from-resource-paths.sh" -p "Microsoft.ApiManagement/service" -r "$resources"
apiManagementName="$resourceName"
echo "[create-api-management] Successfully deployed API Managment instance - $resourceName"
