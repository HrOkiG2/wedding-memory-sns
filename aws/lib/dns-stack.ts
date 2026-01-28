import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

interface DnsStackProps extends cdk.StackProps {
  domainName: string; // サブドメイン含む（例: photos.example.com）
  rootDomain: string; // 親ドメイン（例: example.com）
  hostedZoneId: string; // 既存のRoute53ホストゾーンID
}

export class DnsStack extends cdk.Stack {
  public readonly certificate: acm.Certificate;
  public readonly hostedZone: route53.IHostedZone;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    // 証明書はus-east-1に作成する必要がある（CloudFront用）
    super(scope, id, {
      ...props,
      env: {
        ...props.env,
        region: 'us-east-1',
      },
      crossRegionReferences: true,
    });

    const { domainName, rootDomain, hostedZoneId } = props;

    // 既存のホストゾーンを参照
    this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId,
      zoneName: rootDomain,
    });

    // ACM証明書（サブドメイン用）
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: domainName,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    // Outputs
    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      exportName: 'CertificateArn',
    });

    new cdk.CfnOutput(this, 'DomainName', {
      value: domainName,
      exportName: 'DomainName',
    });
  }
}
