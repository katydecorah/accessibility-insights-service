<!--
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the MIT License.
-->

# ![Product Logo](./icons/brand/blue/brand-blue-48px.png) Accessibility Insights Service

[![Build Status](https://dev.azure.com/accessibility-insights/Accessibility%20Insights%20Service/_apis/build/status/Accessibility-Insights-Service%20CI?branchName=main)](https://dev.azure.com/accessibility-insights/Accessibility%20Insights%20Service/_build/latest?definitionId=28&branchName=main)
[![codecov](https://codecov.io/gh/microsoft/accessibility-insights-service/branch/main/graph/badge.svg)](https://codecov.io/gh/microsoft/accessibility-insights-service)

Accessibility Insights Service is a service that can be used to scan websites for accessibility issues on a periodic basis. It is Typescript project with shell scripts for install and update scenarios.

This project can be run in an Azure environment and can be set up easily using the install scripts provided.

## Building the code

### 1. Clone the repository

-   Clone the repository using one of the following commands
    ```bash
    git clone https://github.com/Microsoft/accessibility-insights-service.git
    ```
-   Select the created directory
    ```bash
    cd accessibility-insights-service
    ```

### 2. Install package specific dependencies

-   Goto the package (under /packages) that you will be working on & follow the readme file under that package.

### 3. Install packages

-   We use yarn for dependencies management. You can install it from [here](https://yarnpkg.com/en/docs/install).
    ```bash
    yarn install
    ```

### 4. Working from Visual Studio Code

-   Open workspace.code-workspace from .vscode\ folder under root directory.
-   On opening the workspace, it will suggest you to install the recommended extensions. Install them.

### 5. Build from command line

-   Build project

    ```bash
       yarn build
    ```

### 6. Commands to run before check in

-   Run the below command to build, test, check file format styling & eslint issues
    ```bash
    yarn precheckin
    ```
-   If the above command failed for formatting issues, run the below command to format all files
    ```bash
    yarn format:fix
    ```

## Testing

### 1. Run Unit tests from command line

-   Run the below command
    ```bash
          yarn test
    ```

### 2. Run current test file from Visual Studio Code

-   Execute "Debug current unit test file" launch task. This build the project & deploys azure function locally.
    You can do this by either of the below two options -

    -   Press F5. (Make sure the correct launch task is selected from the drop down that appears).
    -   Or Press Ctrl+P and then type "debug" followed by space ' '. And then select "Debug current unit test file" from the list that appears.

### 3. Run test in watch mode

-   Goto the package you want to watch for. You can run tests whenever source code is modified in watch mode.

    ```bash
          yarn watch:test
    ```

## Deployment

-   Follow this [README](https://github.com/Microsoft/accessibility-insights-service/blob/main/packages/resource-deployment/README.md) to deploy required Azure resources.

## Debugging

To debug packages locally follow the generic steps below.

1.  Complete deployment of Azure resources in your test subscription.
2.  Run the following script to create the `.env` plain text file under package root folder with environment variables required for the package to run locally:

    ```bash
          ./dist/scripts/create-env-file-for-debug.sh -r <resourceGroupName>
    ```

3.  Run the TypeScript compiler `tsc` for the selected package.
4.  Debug selected package using Visual Studio Code selecting respective debug configuration. For instance, select `Start debugging runner (runner)` configuration to debug `runner` package.

## Telemetry and Monitoring

During deployment, the Azure dashboard will be created to track service metrics and telemetry data.

-   Documentation for all telemetry events sent can be found [here](packages/logger/README.md)
-   Documentation for the azure dashboard created upon deployment can be found [here](packages/resource-deployment/templates/README.md)

## Contributing

All contributions are welcome! Please visit our [Contributing](https://github.com/microsoft/accessibility-insights-service/blob/main/Contributing.md) page.

## Contact us

Please file a [Github Issue](https://github.com/Microsoft/accessibility-insights-service/issues/new/choose). We actively monitor PRs and issues.

Alternatively you may also ask questions on stackoverflow.com and tag them with an `accessibility-insights` tag.

## Reporting security vulnerabilities

If you believe you have found a security vulnerability in this project, please follow [these steps](https://technet.microsoft.com/en-us/security/ff852094.aspx) to report it. For more information on how vulnerabilities are disclosed, see [Coordinated Vulnerability Disclosure](https://technet.microsoft.com/en-us/security/dn467923).
